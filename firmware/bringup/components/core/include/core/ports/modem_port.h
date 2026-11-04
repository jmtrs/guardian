/**
 * @file modem_port.h
 * @brief Driven port: cellular modem with AT interface and GNSS.
 *
 * Unsolicited and response lines are delivered by the adapter through the
 * line sink given at construction time, not through this port.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "core/status.h"

/** Modem operations required by the core. All functions receive @c ctx. */
typedef struct {
    void *ctx; /**< Adapter state, opaque to the core. */

    /** Run the full power-on sequence and wait until the modem answers AT. */
    gd_status_t (*power_on)(void *ctx);

    /** Power the modem off and cut its supply rail. Safe if already off. */
    void (*power_off)(void *ctx);

    /**
     * Send a command and wait for its final result code.
     * @return GD_OK on "OK", GD_ERR_REJECTED on ERROR/+CME, GD_ERR_TIMEOUT otherwise.
     */
    gd_status_t (*command)(void *ctx, const char *cmd, uint32_t timeout_ms);

    /** Send a raw line (CRLF appended) without waiting for a result. */
    void (*send_raw)(void *ctx, const char *line);

    /**
     * Latch the "modem off" pin levels so they survive deep sleep.
     * @return GD_OK only if every modem line is held; sleeping otherwise would
     *         measure P1 with lines in an unknown state.
     */
    gd_status_t (*hold_off_during_sleep)(void *ctx);
} gd_modem_port_t;
