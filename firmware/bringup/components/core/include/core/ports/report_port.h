/**
 * @file report_port.h
 * @brief Driven port: human-readable output of the bring-up session.
 */
#pragma once

/** Text sink. The core formats; the adapter only writes. */
typedef struct {
    void *ctx;                                   /**< Adapter state. */
    void (*write)(void *ctx, const char *text);  /**< Write text as-is, no newline added. */
} gd_report_port_t;

/**
 * @brief printf-style helper over a report port.
 *
 * Output longer than the internal buffer (256 bytes) is truncated.
 */
void gd_report(const gd_report_port_t *report, const char *fmt, ...)
    __attribute__((format(printf, 2, 3)));
