/**
 * @file fakes.h
 * @brief In-memory fakes of every core port, scriptable from tests.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "core/bringup.h"

#define FAKE_MAX_CALLS 32   /**< Commands recorded by the modem fake. */
#define FAKE_REPORT_SIZE 8192

/** Scriptable state behind all fakes. Reset with fakes_reset(). */
typedef struct {
    /* modem */
    gd_status_t power_on_result;
    gd_status_t command_result;
    int power_on_calls;
    int power_off_calls;
    int hold_calls;
    gd_status_t hold_result;
    const char *commands[FAKE_MAX_CALLS];
    int command_count;
    const char *last_raw;
    /* motion */
    gd_status_t probe_result;
    gd_accel_mg_t sample;
    uint16_t armed_threshold;
    int arm_calls;
    int trigger_polls_left; /**< is_triggered returns true while > 0 ... */
    bool stuck_high;        /**< ... or always, if set. */
    int acknowledge_calls;
    gd_status_t acknowledge_result; /**< Failing ack leaves the latch set. */
    /* platform */
    gd_wake_cause_t wake;
    int32_t battery;
    uint32_t slept_ms;
    int deep_sleep_calls;
    /* report */
    char report[FAKE_REPORT_SIZE];
} fakes_t;

extern fakes_t fakes; /**< The single fake world used by tests. */

/** Restore defaults: everything succeeds, sensor at rest on Z, no motion. */
void fakes_reset(void);

/** A service wired to the fakes. */
gd_bringup_t fakes_service(void);

/** True if @p needle appears in the captured report. */
bool fakes_reported(const char *needle);
