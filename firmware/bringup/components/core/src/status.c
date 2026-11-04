/**
 * @file status.c
 * @brief Names for gd_status_t values.
 */
#include "core/status.h"

const char *gd_status_name(gd_status_t status)
{
    switch (status) {
    case GD_OK: return "ok";
    case GD_ERR_NOT_FOUND: return "not found";
    case GD_ERR_TIMEOUT: return "timeout";
    case GD_ERR_REJECTED: return "rejected";
    case GD_ERR_IO: return "i/o error";
    case GD_ERR_STATE: return "invalid state";
    }
    return "unknown";
}
