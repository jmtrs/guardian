/**
 * @file bringup_motion.c
 * @brief Use cases driving the accelerometer: self-test, interrupt, sleep/wake.
 */
#include "core/bringup.h"

/** Settling time after acknowledging a latch before re-checking the line. */
#define RELATCH_CHECK_MS 50u

/** Probe the sensor and report its identity. */
static gd_status_t probe(gd_bringup_t *self)
{
    gd_sensor_info_t info = {0};
    const gd_status_t status = self->motion->probe(self->motion->ctx, &info);
    if (status != GD_OK) {
        gd_report(self->report, "accelerometer: %s\n", gd_status_name(status));
        return status;
    }
    gd_report(self->report, "accelerometer at 0x%02x, id 0x%02x\n", info.bus_address, info.chip_id);
    return GD_OK;
}

/** Arm the interrupt and report the threshold used. */
static gd_status_t arm(gd_bringup_t *self, uint16_t threshold_mg)
{
    const gd_status_t status = self->motion->arm(self->motion->ctx, threshold_mg);
    if (status != GD_OK) {
        gd_report(self->report, "arm failed: %s\n", gd_status_name(status));
        return status;
    }
    gd_report(self->report, "motion armed at %u mg\n", threshold_mg);
    return GD_OK;
}

gd_status_t gd_bringup_sensor_selftest(gd_bringup_t *self)
{
    gd_status_t status = probe(self);
    if (status != GD_OK) return status;

    uint32_t at_rest = 0;
    for (uint32_t i = 0; i < GD_SELFTEST_SAMPLES; i++) {
        gd_accel_mg_t s = {0};
        status = self->motion->read(self->motion->ctx, &s);
        if (status != GD_OK) {
            gd_report(self->report, "read failed: %s\n", gd_status_name(status));
            return status;
        }
        const bool rest = gd_accel_is_at_rest(s);
        at_rest += rest ? 1u : 0u;
        gd_report(self->report, "xyz mg: %6d %6d %6d  |a|=%4lu %s\n", s.x, s.y, s.z,
                  (unsigned long)gd_accel_magnitude_mg(s), rest ? "" : "(not at rest)");
        self->platform->delay_ms(self->platform->ctx, GD_SELFTEST_PERIOD_MS);
    }
    const bool pass = at_rest == GD_SELFTEST_SAMPLES;
    gd_report(self->report, "self-test %s: %lu/%u samples at 1 g\n", pass ? "PASS" : "FAIL",
              (unsigned long)at_rest, GD_SELFTEST_SAMPLES);
    return pass ? GD_OK : GD_ERR_STATE;
}

uint32_t gd_bringup_watch_motion(gd_bringup_t *self, uint16_t threshold_mg)
{
    if (probe(self) != GD_OK || arm(self, threshold_mg) != GD_OK) return 0;
    gd_report(self->report, "move the sensor (%u s)...\n", GD_WATCH_DURATION_MS / 1000u);

    uint32_t hits = 0;
    for (uint32_t t = 0; t < GD_WATCH_DURATION_MS; t += GD_WATCH_POLL_MS) {
        if (self->motion->is_triggered(self->motion->ctx)) {
            const uint8_t source = self->motion->acknowledge(self->motion->ctx);
            gd_report(self->report, "motion #%lu, source 0x%02x\n", (unsigned long)++hits, source);
        }
        self->platform->delay_ms(self->platform->ctx, GD_WATCH_POLL_MS);
    }
    gd_report(self->report, "watch done: %lu interrupts\n", (unsigned long)hits);
    return hits;
}

/** Acknowledge any pending latch; true if the line is low afterwards. */
static bool interrupt_line_clear(gd_bringup_t *self)
{
    if (!self->motion->is_triggered(self->motion->ctx)) return true;
    self->motion->acknowledge(self->motion->ctx);
    self->platform->delay_ms(self->platform->ctx, RELATCH_CHECK_MS);
    return !self->motion->is_triggered(self->motion->ctx);
}

gd_status_t gd_bringup_sleep_until_motion(gd_bringup_t *self, uint16_t threshold_mg)
{
    gd_status_t status = probe(self);
    if (status != GD_OK) return status;
    gd_bringup_modem_off(self);
    status = arm(self, threshold_mg);
    if (status != GD_OK) return status;
    if (!interrupt_line_clear(self)) {
        gd_report(self->report, "interrupt line stuck high: refusing to sleep (would wake at once)\n");
        return GD_ERR_STATE;
    }
    self->modem->hold_off_during_sleep(self->modem->ctx);
    gd_report(self->report, "P1: deep sleep, modem off. Measure current now; move sensor to wake.\n");
    self->platform->deep_sleep_until_motion(self->platform->ctx);
    return GD_OK; /* only reached by host fakes */
}
