/**
 * @file test_bringup.c
 * @brief Tests for the bring-up use cases, driven through port fakes.
 */
#include "core/bringup.h"
#include "fakes.h"
#include "test.h"

static void identify_powers_modem_once_and_runs_queries(void)
{
    fakes_reset();
    gd_bringup_t s = fakes_service();
    gd_bringup_identify(&s);
    gd_bringup_identify(&s);
    CHECK_EQ(fakes.power_on_calls, 1);
    CHECK(fakes.command_count >= 2 * 10);
    CHECK_STR(fakes.commands[0], "ATE0");
    CHECK(fakes_reported("chip: rev v3.1"));
    CHECK(fakes_reported("vbat: 4100 mV"));
}

static void identify_stops_when_modem_does_not_power_on(void)
{
    fakes_reset();
    fakes.power_on_result = GD_ERR_TIMEOUT;
    gd_bringup_t s = fakes_service();
    gd_bringup_identify(&s);
    CHECK_EQ(fakes.command_count, 0);
    CHECK(!s.modem_powered);
    CHECK(fakes_reported("modem power-on failed: timeout"));
}

static void passthrough_sends_line_verbatim(void)
{
    fakes_reset();
    gd_bringup_t s = fakes_service();
    gd_bringup_handle_line(&s, "AT+CSQ");
    CHECK_STR(fakes.last_raw, "AT+CSQ");
}

static void passthrough_power_down_invalidates_state(void)
{
    fakes_reset();
    gd_bringup_t s = fakes_service();
    gd_bringup_handle_line(&s, "AT+CPOF");
    CHECK(!s.modem_powered);
    gd_bringup_handle_line(&s, "!modem on");
    CHECK_EQ(fakes.power_on_calls, 2);
}

static void watch_aborts_after_repeated_ack_failures(void)
{
    fakes_reset();
    fakes.trigger_polls_left = 1;
    fakes.acknowledge_result = GD_ERR_IO;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_watch_motion(&s, 80), 0);
    CHECK_EQ(fakes.acknowledge_calls, 3);
    CHECK(fakes_reported("latch not cleared: i/o error"));
    CHECK(fakes_reported("watch aborted"));
}

static void sleep_refuses_when_modem_pins_not_held(void)
{
    fakes_reset();
    fakes.hold_result = GD_ERR_IO;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sleep_until_motion(&s, 80), GD_ERR_IO);
    CHECK_EQ(fakes.deep_sleep_calls, 0);
    CHECK(fakes_reported("modem pins not held"));
}

static void sleep_refuses_when_latch_cannot_be_cleared(void)
{
    fakes_reset();
    fakes.trigger_polls_left = 1;
    fakes.acknowledge_result = GD_ERR_IO;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sleep_until_motion(&s, 80), GD_ERR_STATE);
    CHECK_EQ(fakes.deep_sleep_calls, 0);
    CHECK(fakes_reported("cannot clear motion latch: i/o error"));
}

static void modem_off_always_runs_and_clears_state(void)
{
    fakes_reset();
    gd_bringup_t s = fakes_service();
    gd_bringup_modem_off(&s);
    CHECK_EQ(fakes.power_off_calls, 1);
    gd_bringup_modem_on(&s);
    gd_bringup_modem_off(&s);
    CHECK(!s.modem_powered);
}

static void selftest_passes_at_rest(void)
{
    fakes_reset();
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sensor_selftest(&s), GD_OK);
    CHECK(fakes_reported("self-test PASS"));
}

static void selftest_fails_when_not_at_rest(void)
{
    fakes_reset();
    fakes.sample = (gd_accel_mg_t){0, 0, 0};
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sensor_selftest(&s), GD_ERR_STATE);
    CHECK(fakes_reported("self-test FAIL"));
}

static void selftest_reports_missing_sensor(void)
{
    fakes_reset();
    fakes.probe_result = GD_ERR_NOT_FOUND;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sensor_selftest(&s), GD_ERR_NOT_FOUND);
    CHECK(fakes_reported("accelerometer: not found"));
}

static void watch_counts_each_latched_interrupt(void)
{
    fakes_reset();
    fakes.trigger_polls_left = 3;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_watch_motion(&s, 96), 3);
    CHECK_EQ(fakes.armed_threshold, 96);
    CHECK_EQ(fakes.slept_ms, GD_WATCH_DURATION_MS);
}

static void sleep_turns_modem_off_and_latches_pins(void)
{
    fakes_reset();
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sleep_until_motion(&s, 80), GD_OK);
    CHECK_EQ(fakes.power_off_calls, 1);
    CHECK_EQ(fakes.arm_calls, 1);
    CHECK_EQ(fakes.hold_calls, 1);
    CHECK_EQ(fakes.deep_sleep_calls, 1);
}

static void sleep_clears_a_pending_latch_first(void)
{
    fakes_reset();
    fakes.trigger_polls_left = 1;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sleep_until_motion(&s, 80), GD_OK);
    CHECK_EQ(fakes.acknowledge_calls, 1);
    CHECK_EQ(fakes.deep_sleep_calls, 1);
}

static void sleep_refuses_when_line_stuck_high(void)
{
    fakes_reset();
    fakes.stuck_high = true;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sleep_until_motion(&s, 80), GD_ERR_STATE);
    CHECK_EQ(fakes.deep_sleep_calls, 0);
    CHECK_EQ(fakes.hold_calls, 0);
}

static void sleep_refuses_without_sensor(void)
{
    fakes_reset();
    fakes.probe_result = GD_ERR_NOT_FOUND;
    gd_bringup_t s = fakes_service();
    CHECK_EQ(gd_bringup_sleep_until_motion(&s, 80), GD_ERR_NOT_FOUND);
    CHECK_EQ(fakes.power_off_calls, 0);
    CHECK_EQ(fakes.deep_sleep_calls, 0);
}

static void motion_wake_acknowledges_latch(void)
{
    fakes_reset();
    fakes.wake = GD_WAKE_MOTION;
    gd_bringup_t s = fakes_service();
    gd_bringup_announce(&s);
    CHECK_EQ(fakes.acknowledge_calls, 1);
    CHECK(fakes_reported("WAKE: motion"));
}

static void unknown_and_invalid_commands_are_reported(void)
{
    fakes_reset();
    gd_bringup_t s = fakes_service();
    gd_bringup_handle_line(&s, "!reboot");
    gd_bringup_handle_line(&s, "!arm x");
    CHECK(fakes_reported("unknown command: !reboot"));
    CHECK(fakes_reported("invalid argument: x"));
}

void test_bringup(void)
{
    RUN(identify_powers_modem_once_and_runs_queries);
    RUN(identify_stops_when_modem_does_not_power_on);
    RUN(passthrough_sends_line_verbatim);
    RUN(passthrough_power_down_invalidates_state);
    RUN(modem_off_always_runs_and_clears_state);
    RUN(watch_aborts_after_repeated_ack_failures);
    RUN(sleep_refuses_when_modem_pins_not_held);
    RUN(sleep_refuses_when_latch_cannot_be_cleared);
    RUN(selftest_passes_at_rest);
    RUN(selftest_fails_when_not_at_rest);
    RUN(selftest_reports_missing_sensor);
    RUN(watch_counts_each_latched_interrupt);
    RUN(sleep_turns_modem_off_and_latches_pins);
    RUN(sleep_clears_a_pending_latch_first);
    RUN(sleep_refuses_when_line_stuck_high);
    RUN(sleep_refuses_without_sensor);
    RUN(motion_wake_acknowledges_latch);
    RUN(unknown_and_invalid_commands_are_reported);
}
