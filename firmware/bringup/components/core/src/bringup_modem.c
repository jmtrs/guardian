/**
 * @file bringup_modem.c
 * @brief Use cases driving the modem: identity, network, power, GNSS.
 */
#include "core/bringup.h"

#include <stddef.h>

/** Default timeout for identification and network queries. */
#define QUERY_TIMEOUT_MS 5000u
/** GNSS power-up answers slowly on the A7670 family. */
#define GNSS_TIMEOUT_MS 10000u

/**
 * Queries that identify the modem and its network state. Order matters:
 * echo off first so responses are not interleaved with the command text.
 */
static const char *const IDENTIFY_QUERIES[] = {
    "ATE0",          /* echo off */
    "ATI",           /* manufacturer, model, revision */
    "AT+SIMCOMATI",  /* SIMCom extended identity (firmware build) */
    "AT+CGMR",       /* firmware revision */
    "AT+CPIN?",      /* SIM ready / PIN required */
    "AT+CICCID",     /* SIM ICCID */
    "AT+CSQ",        /* signal quality */
    "AT+CREG?",      /* circuit-switched registration */
    "AT+CEREG?",     /* LTE (EPS) registration */
    "AT+COPS?",      /* operator */
    "AT+CPSI?",      /* serving cell, band, RAT */
};

gd_status_t gd_bringup_modem_on(gd_bringup_t *self)
{
    if (self->modem_powered) return GD_OK;
    const gd_status_t status = self->modem->power_on(self->modem->ctx);
    self->modem_powered = status == GD_OK;
    if (status != GD_OK) gd_report(self->report, "modem power-on failed: %s\n", gd_status_name(status));
    return status;
}

void gd_bringup_modem_off(gd_bringup_t *self)
{
    self->modem->power_off(self->modem->ctx);
    self->modem_powered = false;
}

void gd_bringup_identify(gd_bringup_t *self)
{
    gd_platform_identity_t id = {0};
    self->platform->identity(self->platform->ctx, &id);
    gd_report(self->report, "chip: rev v%u.%u, %u cores, flash %lu KB, psram %lu KB\n",
              id.chip_revision / 100u, id.chip_revision % 100u, id.cores,
              (unsigned long)(id.flash_bytes >> 10), (unsigned long)(id.psram_bytes >> 10));
    gd_report(self->report, "mac:  %02x:%02x:%02x:%02x:%02x:%02x\n",
              id.mac[0], id.mac[1], id.mac[2], id.mac[3], id.mac[4], id.mac[5]);
    gd_bringup_battery(self);

    if (gd_bringup_modem_on(self) != GD_OK) return;
    for (size_t i = 0; i < sizeof(IDENTIFY_QUERIES) / sizeof(IDENTIFY_QUERIES[0]); i++) {
        gd_report(self->report, "> %s\n", IDENTIFY_QUERIES[i]);
        const gd_status_t status = self->modem->command(self->modem->ctx, IDENTIFY_QUERIES[i],
                                                        QUERY_TIMEOUT_MS);
        if (status != GD_OK) gd_report(self->report, "  (%s)\n", gd_status_name(status));
    }
}

gd_status_t gd_bringup_gnss_on(gd_bringup_t *self)
{
    gd_status_t status = gd_bringup_modem_on(self);
    if (status != GD_OK) return status;
    gd_report(self->report, "> AT+CGNSSPWR=1\n");
    status = self->modem->command(self->modem->ctx, "AT+CGNSSPWR=1", GNSS_TIMEOUT_MS);
    if (status == GD_OK) {
        gd_report(self->report, "GNSS on. Antenna outdoors, then repeat AT+CGNSSINFO until fix.\n");
    } else {
        gd_report(self->report, "GNSS power-up: %s\n", gd_status_name(status));
    }
    return status;
}

void gd_bringup_passthrough(gd_bringup_t *self, const char *line)
{
    if (gd_bringup_modem_on(self) != GD_OK) return;
    self->modem->send_raw(self->modem->ctx, line);
    if (gd_at_powers_down(line)) self->modem_powered = false;
}
