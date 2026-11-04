/**
 * @file test_domain.c
 * @brief Tests for pure domain rules: acceleration and command parsing.
 */
#include "core/accel.h"
#include "core/command.h"
#include "test.h"

static void magnitude_is_euclidean_floor(void)
{
    CHECK_EQ(gd_accel_magnitude_mg((gd_accel_mg_t){0, 0, 0}), 0);
    CHECK_EQ(gd_accel_magnitude_mg((gd_accel_mg_t){3, 4, 0}), 5);
    CHECK_EQ(gd_accel_magnitude_mg((gd_accel_mg_t){0, 0, -1000}), 1000);
    CHECK_EQ(gd_accel_magnitude_mg((gd_accel_mg_t){2047, 2047, 2047}), 3545);
}

static void at_rest_accepts_gravity_in_any_orientation(void)
{
    CHECK(gd_accel_is_at_rest((gd_accel_mg_t){0, 0, 1000}));
    CHECK(gd_accel_is_at_rest((gd_accel_mg_t){-1000, 0, 0}));
    CHECK(gd_accel_is_at_rest((gd_accel_mg_t){577, 577, 577}));
    CHECK(gd_accel_is_at_rest((gd_accel_mg_t){0, 0, 850}));
    CHECK(gd_accel_is_at_rest((gd_accel_mg_t){0, 0, 1150}));
}

static void at_rest_rejects_free_fall_and_shock(void)
{
    CHECK(!gd_accel_is_at_rest((gd_accel_mg_t){0, 0, 0}));
    CHECK(!gd_accel_is_at_rest((gd_accel_mg_t){0, 0, 849}));
    CHECK(!gd_accel_is_at_rest((gd_accel_mg_t){0, 0, 1151}));
    CHECK(!gd_accel_is_at_rest((gd_accel_mg_t){0, 0, 2000}));
}

static void threshold_is_clamped(void)
{
    CHECK_EQ(gd_motion_threshold_clamp(0), GD_MOTION_THRESHOLD_MIN_MG);
    CHECK_EQ(gd_motion_threshold_clamp(80), 80);
    CHECK_EQ(gd_motion_threshold_clamp(99999), GD_MOTION_THRESHOLD_MAX_MG);
}

static void parses_blank_and_passthrough(void)
{
    CHECK_EQ(gd_command_parse("").kind, GD_CMD_EMPTY);
    CHECK_EQ(gd_command_parse("   ").kind, GD_CMD_EMPTY);
    const gd_command_t at = gd_command_parse("  AT+CSQ");
    CHECK_EQ(at.kind, GD_CMD_AT_PASSTHROUGH);
    CHECK_STR(at.text, "AT+CSQ");
}

static void parses_simple_commands(void)
{
    CHECK_EQ(gd_command_parse("!").kind, GD_CMD_HELP);
    CHECK_EQ(gd_command_parse("!help").kind, GD_CMD_HELP);
    CHECK_EQ(gd_command_parse("!diag").kind, GD_CMD_DIAG);
    CHECK_EQ(gd_command_parse(" ! gnss ").kind, GD_CMD_GNSS);
    CHECK_EQ(gd_command_parse("!lis").kind, GD_CMD_SENSOR);
    CHECK_EQ(gd_command_parse("!vbat").kind, GD_CMD_BATTERY);
    CHECK_EQ(gd_command_parse("!modem on").kind, GD_CMD_MODEM_ON);
    CHECK_EQ(gd_command_parse("!modem off").kind, GD_CMD_MODEM_OFF);
}

static void parses_threshold_with_default_and_clamp(void)
{
    gd_command_t c = gd_command_parse("!arm");
    CHECK_EQ(c.kind, GD_CMD_ARM);
    CHECK_EQ(c.threshold_mg, GD_MOTION_THRESHOLD_DEFAULT_MG);
    c = gd_command_parse("!sleep 120");
    CHECK_EQ(c.kind, GD_CMD_SLEEP);
    CHECK_EQ(c.threshold_mg, 120);
    CHECK_EQ(gd_command_parse("!arm 1").threshold_mg, GD_MOTION_THRESHOLD_MIN_MG);
    CHECK_EQ(gd_command_parse("!arm 99999").threshold_mg, GD_MOTION_THRESHOLD_MAX_MG);
}

static void rejects_malformed_input(void)
{
    CHECK_EQ(gd_command_parse("!arm abc").kind, GD_CMD_INVALID_ARGUMENT);
    CHECK_EQ(gd_command_parse("!arm -5").kind, GD_CMD_INVALID_ARGUMENT);
    CHECK_EQ(gd_command_parse("!arm 100000").kind, GD_CMD_INVALID_ARGUMENT);
    CHECK_EQ(gd_command_parse("!arm 80 90").kind, GD_CMD_INVALID_ARGUMENT);
    CHECK_EQ(gd_command_parse("!modem").kind, GD_CMD_INVALID_ARGUMENT);
    CHECK_EQ(gd_command_parse("!modem maybe").kind, GD_CMD_INVALID_ARGUMENT);
    CHECK_EQ(gd_command_parse("!diag now").kind, GD_CMD_INVALID_ARGUMENT);
    const gd_command_t c = gd_command_parse("!reboot");
    CHECK_EQ(c.kind, GD_CMD_UNKNOWN);
    CHECK_STR(c.text, "reboot");
}

static void detects_power_down_commands(void)
{
    CHECK(gd_at_powers_down("AT+CPOF"));
    CHECK(gd_at_powers_down("  at+cpowd=1"));
    CHECK(!gd_at_powers_down("AT+CPIN?"));
    CHECK(!gd_at_powers_down("AT+CPO"));
    CHECK(!gd_at_powers_down(""));
}

void test_domain(void)
{
    RUN(magnitude_is_euclidean_floor);
    RUN(at_rest_accepts_gravity_in_any_orientation);
    RUN(at_rest_rejects_free_fall_and_shock);
    RUN(threshold_is_clamped);
    RUN(parses_blank_and_passthrough);
    RUN(parses_simple_commands);
    RUN(parses_threshold_with_default_and_clamp);
    RUN(rejects_malformed_input);
    RUN(detects_power_down_commands);
}
