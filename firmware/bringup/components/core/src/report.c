/**
 * @file report.c
 * @brief printf-style formatting over gd_report_port_t.
 */
#include "core/ports/report_port.h"

#include <stdarg.h>
#include <stdio.h>

void gd_report(const gd_report_port_t *report, const char *fmt, ...)
{
    char buffer[256];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buffer, sizeof(buffer), fmt, args);
    va_end(args);
    report->write(report->ctx, buffer);
}
