/**
 * @file bringup.c
 * @brief Bring-up service: construction, announce, help and command dispatch.
 */
#include "core/bringup.h"

gd_bringup_t gd_bringup_create(const gd_modem_port_t *modem,
                               const gd_motion_sensor_port_t *motion,
                               const gd_platform_port_t *platform,
                               const gd_report_port_t *report)
{
    gd_bringup_t self = {
        .modem = modem, .motion = motion, .platform = platform, .report = report,
        .modem_powered = false,
    };
    return self;
}

void gd_bringup_help(gd_bringup_t *self)
{
    gd_report(self->report,
              "\nGuardian bring-up. '!' = local command; any other line goes to the modem.\n"
              "  !diag          board + modem identity, SIM, signal, registration\n"
              "  !modem on|off  modem power sequence\n"
              "  !gnss          start GNSS (then AT+CGNSSINFO until fix)\n"
              "  !lis           accelerometer self-test (expects ~1 g at rest)\n"
              "  !arm [mg]      watch motion interrupt for %u s (default %u mg)\n"
              "  !sleep [mg]    P1: modem off, deep sleep until motion\n"
              "  !vbat          battery rail\n"
              "  !help\n\n",
              GD_WATCH_DURATION_MS / 1000u, GD_MOTION_THRESHOLD_DEFAULT_MG);
}

/** After a motion wake, clear the latch so the next sleep is not aborted. */
static void report_wake_source(gd_bringup_t *self)
{
    gd_sensor_info_t info = {0};
    if (self->motion->probe(self->motion->ctx, &info) != GD_OK) {
        gd_report(self->report, "accelerometer not answering after wake\n");
        return;
    }
    uint8_t source = 0;
    const gd_status_t status = self->motion->acknowledge(self->motion->ctx, &source);
    if (status == GD_OK) gd_report(self->report, "interrupt source 0x%02x\n", source);
    else gd_report(self->report, "could not clear wake latch: %s\n", gd_status_name(status));
}

void gd_bringup_announce(gd_bringup_t *self)
{
    switch (self->platform->wake_cause(self->platform->ctx)) {
    case GD_WAKE_MOTION:
        gd_report(self->report, "\n*** WAKE: motion interrupt ***\n");
        report_wake_source(self);
        break;
    case GD_WAKE_POWER_ON:
        gd_report(self->report, "\nboot: power-on / reset\n");
        break;
    case GD_WAKE_OTHER:
        gd_report(self->report, "\nboot: other wake source\n");
        break;
    }
    gd_bringup_help(self);
}

void gd_bringup_battery(gd_bringup_t *self)
{
    const int32_t mv = self->platform->battery_mv(self->platform->ctx);
    if (mv < 0) gd_report(self->report, "vbat: unavailable\n");
    else gd_report(self->report, "vbat: %ld mV\n", (long)mv);
}

void gd_bringup_handle_line(gd_bringup_t *self, const char *line)
{
    const gd_command_t cmd = gd_command_parse(line);
    switch (cmd.kind) {
    case GD_CMD_EMPTY: break;
    case GD_CMD_HELP: gd_bringup_help(self); break;
    case GD_CMD_DIAG: gd_bringup_identify(self); break;
    case GD_CMD_MODEM_ON: gd_bringup_modem_on(self); break;
    case GD_CMD_MODEM_OFF: gd_bringup_modem_off(self); break;
    case GD_CMD_GNSS: gd_bringup_gnss_on(self); break;
    case GD_CMD_SENSOR: gd_bringup_sensor_selftest(self); break;
    case GD_CMD_ARM: gd_bringup_watch_motion(self, cmd.threshold_mg); break;
    case GD_CMD_SLEEP: gd_bringup_sleep_until_motion(self, cmd.threshold_mg); break;
    case GD_CMD_BATTERY: gd_bringup_battery(self); break;
    case GD_CMD_AT_PASSTHROUGH: gd_bringup_passthrough(self, cmd.text); break;
    case GD_CMD_UNKNOWN: gd_report(self->report, "unknown command: !%s (try !help)\n", cmd.text); break;
    case GD_CMD_INVALID_ARGUMENT: gd_report(self->report, "invalid argument: %s\n", cmd.text); break;
    }
}
