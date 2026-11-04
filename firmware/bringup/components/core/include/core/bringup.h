/**
 * @file bringup.h
 * @brief Application layer: bench bring-up use cases.
 *
 * Each use case maps to a step of docs/COMPONENTES.md, "Primera secuencia al
 * recibir las piezas". The service depends only on ports, so it runs both on
 * the board (ESP-IDF adapters) and on the host (test fakes).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "core/command.h"
#include "core/ports/modem_port.h"
#include "core/ports/motion_sensor_port.h"
#include "core/ports/platform_port.h"
#include "core/ports/report_port.h"

/** Samples taken by the sensor self-test. */
#define GD_SELFTEST_SAMPLES 10u
/** Interval between self-test samples. */
#define GD_SELFTEST_PERIOD_MS 100u
/** How long !arm watches the interrupt line. */
#define GD_WATCH_DURATION_MS 30000u
/** Poll period of the interrupt line while watching. */
#define GD_WATCH_POLL_MS 100u

/** Bring-up service: the ports it drives plus minimal session state. */
typedef struct {
    const gd_modem_port_t *modem;          /**< Cellular modem + GNSS. */
    const gd_motion_sensor_port_t *motion; /**< Accelerometer. */
    const gd_platform_port_t *platform;    /**< MCU services. */
    const gd_report_port_t *report;        /**< Operator output. */
    bool modem_powered;                    /**< Last known modem power state. */
} gd_bringup_t;

/**
 * @brief Build a service over the given ports. Ports must outlive it.
 */
gd_bringup_t gd_bringup_create(const gd_modem_port_t *modem,
                               const gd_motion_sensor_port_t *motion,
                               const gd_platform_port_t *platform,
                               const gd_report_port_t *report);

/** Print wake cause, board identity and the command list. */
void gd_bringup_announce(gd_bringup_t *self);

/** Print the command list. */
void gd_bringup_help(gd_bringup_t *self);

/** Steps 1-2: board identity, modem identity, SIM and network registration. */
void gd_bringup_identify(gd_bringup_t *self);

/** Power the modem on (no-op if already on). */
gd_status_t gd_bringup_modem_on(gd_bringup_t *self);

/** Power the modem off. Always runs the sequence: state may be stale after reset. */
void gd_bringup_modem_off(gd_bringup_t *self);

/** Step 2: start the GNSS engine. Fix is then polled with AT+CGNSSINFO. */
gd_status_t gd_bringup_gnss_on(gd_bringup_t *self);

/** Forward an operator AT line, powering the modem first if needed. */
void gd_bringup_passthrough(gd_bringup_t *self, const char *line);

/**
 * @brief Step 3: detect the accelerometer and check it reads ~1 g at rest.
 * @return GD_OK if detected and every sample is at rest.
 */
gd_status_t gd_bringup_sensor_selftest(gd_bringup_t *self);

/**
 * @brief Step 4a: arm the motion interrupt and count triggers while awake.
 * @param threshold_mg Threshold, already clamped.
 * @return Number of interrupts observed in GD_WATCH_DURATION_MS.
 */
uint32_t gd_bringup_watch_motion(gd_bringup_t *self, uint16_t threshold_mg);

/**
 * @brief Step 4b / power test P1: modem off, motion armed, deep sleep.
 *
 * Refuses to sleep (and returns) if the interrupt line stays high after
 * acknowledging, because the board would wake immediately in a loop.
 * On success it does not return.
 */
gd_status_t gd_bringup_sleep_until_motion(gd_bringup_t *self, uint16_t threshold_mg);

/** Print the battery rail. */
void gd_bringup_battery(gd_bringup_t *self);

/** Parse a console line and run the matching use case. */
void gd_bringup_handle_line(gd_bringup_t *self, const char *line);
