/**
 * @file lis3dh_i2c.c
 * @brief LIS3DH adapter: register map, motion-interrupt recipe, I2C transport.
 *
 * Interrupt configuration follows ST AN3308 sec. 6.3 (wake-up): high-pass
 * filter on IA1 so gravity is ignored, OR of X/Y/Z high events, latched INT1.
 */
#include "adapters/lis3dh_i2c.h"

#include <assert.h>

#include "driver/i2c_master.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define REG_WHO_AM_I   0x0F
#define REG_CTRL1      0x20
#define REG_CTRL2      0x21
#define REG_CTRL3      0x22
#define REG_CTRL4      0x23
#define REG_CTRL5      0x24
#define REG_REFERENCE  0x26
#define REG_OUT_X_L    0x28
#define REG_INT1_CFG   0x30
#define REG_INT1_SRC   0x31
#define REG_INT1_THS   0x32
#define REG_INT1_DUR   0x33
#define AUTO_INCREMENT 0x80
#define CHIP_ID        0x33

#define CTRL1_100HZ_XYZ 0x57 /**< ODR 100 Hz, normal mode, XYZ enabled. */
#define CTRL1_10HZ_XYZ  0x27 /**< ODR 10 Hz: enough for wake, lower current. */
#define CTRL2_HP_IA1    0x01 /**< High-pass filter on interrupt generator 1. */
#define CTRL3_I1_IA1    0x40 /**< Route IA1 to INT1. */
#define CTRL4_BDU_HR    0x88 /**< Block data update, high resolution, +-2 g. */
#define CTRL5_LIR_INT1  0x08 /**< Latch INT1 until INT1_SRC is read. */
#define INT1_CFG_XYZ_HI 0x2A /**< OR of XH, YH, ZH events. */
#define THRESHOLD_STEP_MG 16 /**< INT1_THS LSB at +-2 g. */
#define FILTER_SETTLE_MS  300

#define I2C_TIMEOUT_MS 100
#define I2C_SPEED_HZ   400000

static const char *TAG = "lis3dh";
static const uint8_t ADDRESSES[] = {0x18, 0x19}; /**< SA0 low / high. */

/** Adapter state. Single instance. */
typedef struct {
    lis3dh_config_t config;
    i2c_master_bus_handle_t bus;
    i2c_master_dev_handle_t device;
    uint8_t address;
} lis3dh_t;

static lis3dh_t s_sensor;

static gd_status_t to_status(esp_err_t err)
{
    if (err == ESP_OK) return GD_OK;
    if (err == ESP_ERR_TIMEOUT) return GD_ERR_TIMEOUT;
    return GD_ERR_IO;
}

static gd_status_t write_reg(lis3dh_t *self, uint8_t reg, uint8_t value)
{
    const uint8_t frame[2] = {reg, value};
    return to_status(i2c_master_transmit(self->device, frame, sizeof(frame), I2C_TIMEOUT_MS));
}

static gd_status_t read_regs(lis3dh_t *self, uint8_t reg, uint8_t *out, size_t count)
{
    if (count > 1) reg |= AUTO_INCREMENT;
    return to_status(i2c_master_transmit_receive(self->device, &reg, 1, out, count, I2C_TIMEOUT_MS));
}

/** Attach to @p address and check WHO_AM_I. Detaches on mismatch. */
static gd_status_t attach(lis3dh_t *self, uint8_t address)
{
    const i2c_device_config_t cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = address,
        .scl_speed_hz = I2C_SPEED_HZ,
    };
    if (i2c_master_bus_add_device(self->bus, &cfg, &self->device) != ESP_OK) return GD_ERR_IO;
    uint8_t id = 0;
    if (read_regs(self, REG_WHO_AM_I, &id, 1) == GD_OK && id == CHIP_ID) {
        self->address = address;
        return GD_OK;
    }
    ESP_LOGW(TAG, "0x%02x answered with id 0x%02x: not a LIS3DH", address, id);
    i2c_master_bus_rm_device(self->device);
    self->device = NULL;
    return GD_ERR_NOT_FOUND;
}

/** Leave the sensor in plain sampling mode (100 Hz, HR, +-2 g). */
static gd_status_t configure_sampling(lis3dh_t *self)
{
    gd_status_t status = write_reg(self, REG_CTRL1, CTRL1_100HZ_XYZ);
    if (status == GD_OK) status = write_reg(self, REG_CTRL4, CTRL4_BDU_HR);
    vTaskDelay(pdMS_TO_TICKS(20));
    return status;
}

static gd_status_t probe(void *ctx, gd_sensor_info_t *info)
{
    lis3dh_t *self = ctx;
    if (self->device == NULL) {
        gd_status_t status = GD_ERR_NOT_FOUND;
        for (size_t i = 0; i < sizeof(ADDRESSES) && status != GD_OK; i++) {
            if (i2c_master_probe(self->bus, ADDRESSES[i], I2C_TIMEOUT_MS) == ESP_OK) {
                status = attach(self, ADDRESSES[i]);
            }
        }
        if (status != GD_OK) return status;
        status = configure_sampling(self);
        if (status != GD_OK) { /* detach so the next probe retries from scratch */
            i2c_master_bus_rm_device(self->device);
            self->device = NULL;
            return status;
        }
    }
    info->bus_address = self->address;
    info->chip_id = CHIP_ID;
    return GD_OK;
}

static gd_status_t read_sample(void *ctx, gd_accel_mg_t *sample)
{
    lis3dh_t *self = ctx;
    if (self->device == NULL) return GD_ERR_STATE;
    uint8_t raw[6];
    const gd_status_t status = read_regs(self, REG_OUT_X_L, raw, sizeof(raw));
    if (status != GD_OK) return status;
    /* 12-bit left-justified two's complement; 1 mg/digit in HR at +-2 g. */
    sample->x = (int16_t)((int16_t)(raw[0] | (raw[1] << 8)) >> 4);
    sample->y = (int16_t)((int16_t)(raw[2] | (raw[3] << 8)) >> 4);
    sample->z = (int16_t)((int16_t)(raw[4] | (raw[5] << 8)) >> 4);
    return GD_OK;
}

static gd_status_t acknowledge(void *ctx, uint8_t *source)
{
    lis3dh_t *self = ctx;
    *source = 0;
    if (self->device == NULL) return GD_ERR_STATE;
    return read_regs(self, REG_INT1_SRC, source, 1); /* reading INT1_SRC clears the latch */
}

static gd_status_t arm(void *ctx, uint16_t threshold_mg)
{
    lis3dh_t *self = ctx;
    if (self->device == NULL) return GD_ERR_STATE;
    const uint8_t steps = (uint8_t)(threshold_mg / THRESHOLD_STEP_MG);
    const struct { uint8_t reg, value; } sequence[] = {
        {REG_CTRL1, CTRL1_10HZ_XYZ}, {REG_CTRL2, CTRL2_HP_IA1}, {REG_CTRL3, CTRL3_I1_IA1},
        {REG_CTRL4, CTRL4_BDU_HR},   {REG_CTRL5, CTRL5_LIR_INT1}, {REG_INT1_THS, steps},
        {REG_INT1_DUR, 0x00},
    };
    for (size_t i = 0; i < sizeof(sequence) / sizeof(sequence[0]); i++) {
        const gd_status_t status = write_reg(self, sequence[i].reg, sequence[i].value);
        if (status != GD_OK) return status;
    }
    uint8_t reference;
    gd_status_t status = read_regs(self, REG_REFERENCE, &reference, 1); /* resets the HP filter */
    if (status == GD_OK) status = write_reg(self, REG_INT1_CFG, INT1_CFG_XYZ_HI);
    if (status != GD_OK) return status;
    vTaskDelay(pdMS_TO_TICKS(FILTER_SETTLE_MS));
    uint8_t source;
    return acknowledge(self, &source); /* drop events latched while the filter settled */
}

static bool is_triggered(void *ctx)
{
    const lis3dh_t *self = ctx;
    return gpio_get_level(self->config.interrupt) == 1;
}

static const gd_motion_sensor_port_t PORT = {
    .ctx = &s_sensor,
    .probe = probe,
    .read = read_sample,
    .arm = arm,
    .is_triggered = is_triggered,
    .acknowledge = acknowledge,
};

const gd_motion_sensor_port_t *lis3dh_i2c_create(const lis3dh_config_t *config)
{
    assert(s_sensor.bus == NULL && "lis3dh_i2c_create called twice");
    s_sensor.config = *config;
    const i2c_master_bus_config_t bus = {
        .i2c_port = config->i2c_port,
        .sda_io_num = config->sda,
        .scl_io_num = config->scl,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true, /* fallback; breakouts carry their own */
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus, &s_sensor.bus));
    /* GPIO34-39 have no internal pulls; LIS3DH drives INT1 push-pull. */
    const gpio_config_t interrupt = {
        .pin_bit_mask = 1ULL << config->interrupt,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&interrupt));
    return &PORT;
}
