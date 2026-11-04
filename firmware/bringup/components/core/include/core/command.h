/**
 * @file command.h
 * @brief Operator command language of the bring-up console.
 *
 * Lines starting with '!' are local commands; any other non-empty line is
 * forwarded verbatim to the modem as an AT command. Parsing is pure: no I/O.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

/** Kind of command recognised on a console line. */
typedef enum {
    GD_CMD_EMPTY,            /**< Blank line: nothing to do. */
    GD_CMD_HELP,             /**< !help */
    GD_CMD_DIAG,             /**< !diag - board + modem identity and network. */
    GD_CMD_MODEM_ON,         /**< !modem on */
    GD_CMD_MODEM_OFF,        /**< !modem off */
    GD_CMD_GNSS,             /**< !gnss - power the GNSS engine. */
    GD_CMD_SENSOR,           /**< !lis - accelerometer self-test. */
    GD_CMD_ARM,              /**< !arm [mg] - watch motion interrupt while awake. */
    GD_CMD_SLEEP,            /**< !sleep [mg] - deep sleep until motion (P1). */
    GD_CMD_BATTERY,          /**< !vbat */
    GD_CMD_AT_PASSTHROUGH,   /**< Not a '!' line: send to the modem as-is. */
    GD_CMD_UNKNOWN,          /**< '!' followed by an unrecognised word. */
    GD_CMD_INVALID_ARGUMENT, /**< Known command, malformed argument. */
} gd_command_kind_t;

/** A parsed console line. */
typedef struct {
    gd_command_kind_t kind; /**< What to do. */
    uint16_t threshold_mg;  /**< For ARM/SLEEP: clamped threshold, default if omitted. */
    const char *text;       /**< For AT_PASSTHROUGH/UNKNOWN: points into the input line. */
} gd_command_t;

/**
 * @brief Parse one console line.
 * @param line NUL-terminated line without CR/LF. Must outlive the result,
 *             because gd_command_t::text points into it.
 * @return Parsed command; never fails, unrecognised input maps to UNKNOWN.
 */
gd_command_t gd_command_parse(const char *line);

/**
 * @brief Whether an AT line switches the modem off (AT+CPOF, AT+CPOWD...).
 *
 * Lets the service keep its power state truthful when the operator powers the
 * modem down through passthrough. Case-insensitive, leading spaces ignored.
 */
bool gd_at_powers_down(const char *line);
