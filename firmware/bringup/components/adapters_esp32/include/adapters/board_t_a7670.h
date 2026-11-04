/**
 * @file board_t_a7670.h
 * @brief Pin map of the LILYGO T-A7670E (ESP32 version) plus Guardian wiring.
 *
 * Source: Xinyuan-LilyGO/LilyGo-Modem-Series, examples/ATdebug/utilities.h,
 * block LILYGO_T_A7670. Cross-check against the silkscreen of the received
 * unit before trusting it. Only the composition root (main) includes this.
 */
#pragma once

#include "driver/gpio.h"
#include "driver/i2c_types.h"
#include "driver/uart.h"
#include "hal/adc_types.h"

/* --- Operator console (USB serial bridge) --------------------------- */
#define BOARD_CONSOLE_UART      UART_NUM_0

/* --- Modem (SIMCom A7670E) ------------------------------------------- */
#define BOARD_MODEM_UART        UART_NUM_1
#define BOARD_MODEM_BAUD        115200
#define BOARD_MODEM_TX          GPIO_NUM_26
#define BOARD_MODEM_RX          GPIO_NUM_27
#define BOARD_MODEM_DTR         GPIO_NUM_25  /**< LOW = modem may not UART-sleep. */
#define BOARD_MODEM_RING        GPIO_NUM_33
#define BOARD_MODEM_PWRKEY      GPIO_NUM_4   /**< Pulse HIGH to toggle power. RTC GPIO. */
#define BOARD_MODEM_RESET       GPIO_NUM_5
#define BOARD_MODEM_RESET_LEVEL 1            /**< Reset is active HIGH on this board. */
/** Modem supply switch, HIGH = powered. Strapping pin (MTDI): drive only after boot. RTC GPIO. */
#define BOARD_MODEM_POWER_EN    GPIO_NUM_12

/* --- Battery sense --------------------------------------------------- */
/** IO35 = ADC1 channel 7 behind divider R7/R9 (schematic V1.4, page 4). */
#define BOARD_BATTERY_ADC_CHANNEL ADC_CHANNEL_7
/** Divider ratio x1000. Assumed 2:1 until measured with a multimeter. */
#define BOARD_BATTERY_DIVIDER_X1000 2000

/* --- Guardian wiring: LIS3DH breakout -------------------------------- */
#define BOARD_MOTION_I2C_PORT   I2C_NUM_0
#define BOARD_MOTION_SDA        GPIO_NUM_21
#define BOARD_MOTION_SCL        GPIO_NUM_22
/**
 * INT1. Input-only, RTC-capable (ext0 wake, level HIGH). GPIO34 has no internal
 * pulls: fit an external ~100 k pull-down so a loose wire cannot float the line
 * and wake the board in a loop. LIS3DH INT is push-pull active HIGH.
 */
#define BOARD_MOTION_INT        GPIO_NUM_34
