/**
 * @file fakes.c
 * @brief Fake port implementations backed by the global ::fakes state.
 */
#include "fakes.h"

#include <string.h>

fakes_t fakes;

static gd_status_t modem_power_on(void *ctx) { (void)ctx; fakes.power_on_calls++; return fakes.power_on_result; }
static void modem_power_off(void *ctx) { (void)ctx; fakes.power_off_calls++; }
static gd_status_t modem_hold(void *ctx) { (void)ctx; fakes.hold_calls++; return fakes.hold_result; }
static void modem_send_raw(void *ctx, const char *line) { (void)ctx; fakes.last_raw = line; }

static gd_status_t modem_command(void *ctx, const char *cmd, uint32_t timeout_ms)
{
    (void)ctx; (void)timeout_ms;
    if (fakes.command_count < FAKE_MAX_CALLS) fakes.commands[fakes.command_count++] = cmd;
    return fakes.command_result;
}

static gd_status_t motion_probe(void *ctx, gd_sensor_info_t *info)
{
    (void)ctx;
    info->bus_address = 0x19;
    info->chip_id = 0x33;
    return fakes.probe_result;
}

static gd_status_t motion_read(void *ctx, gd_accel_mg_t *s) { (void)ctx; *s = fakes.sample; return GD_OK; }

static gd_status_t motion_arm(void *ctx, uint16_t mg)
{
    (void)ctx;
    fakes.arm_calls++;
    fakes.armed_threshold = mg;
    return GD_OK;
}

static bool motion_triggered(void *ctx)
{
    (void)ctx;
    if (fakes.stuck_high) return true;
    return fakes.trigger_polls_left > 0;
}

static gd_status_t motion_ack(void *ctx, uint8_t *source)
{
    (void)ctx;
    fakes.acknowledge_calls++;
    *source = 0x4A;
    if (fakes.acknowledge_result != GD_OK) return fakes.acknowledge_result;
    if (fakes.trigger_polls_left > 0) fakes.trigger_polls_left--;
    return GD_OK;
}

static void platform_delay(void *ctx, uint32_t ms) { (void)ctx; fakes.slept_ms += ms; }
static int32_t platform_battery(void *ctx) { (void)ctx; return fakes.battery; }
static gd_wake_cause_t platform_wake(void *ctx) { (void)ctx; return fakes.wake; }
static void platform_sleep(void *ctx) { (void)ctx; fakes.deep_sleep_calls++; }

static void platform_identity(void *ctx, gd_platform_identity_t *id)
{
    (void)ctx;
    memset(id, 0, sizeof(*id));
    id->chip_revision = 301;
    id->cores = 2;
}

static void report_write(void *ctx, const char *text)
{
    (void)ctx;
    strncat(fakes.report, text, sizeof(fakes.report) - strlen(fakes.report) - 1);
}

static const gd_modem_port_t MODEM = {NULL, modem_power_on, modem_power_off, modem_command,
                                      modem_send_raw, modem_hold};
static const gd_motion_sensor_port_t MOTION = {NULL, motion_probe, motion_read, motion_arm,
                                               motion_triggered, motion_ack};
static const gd_platform_port_t PLATFORM = {NULL, platform_delay, platform_identity,
                                            platform_battery, platform_wake, platform_sleep};
static const gd_report_port_t REPORT = {NULL, report_write};

void fakes_reset(void)
{
    memset(&fakes, 0, sizeof(fakes));
    fakes.power_on_result = GD_OK;
    fakes.command_result = GD_OK;
    fakes.probe_result = GD_OK;
    fakes.acknowledge_result = GD_OK;
    fakes.hold_result = GD_OK;
    fakes.sample = (gd_accel_mg_t){.x = 10, .y = -20, .z = 1003};
    fakes.wake = GD_WAKE_POWER_ON;
    fakes.battery = 4100;
}

gd_bringup_t fakes_service(void) { return gd_bringup_create(&MODEM, &MOTION, &PLATFORM, &REPORT); }

bool fakes_reported(const char *needle) { return strstr(fakes.report, needle) != NULL; }
