/**
 * @file status.h
 * @brief Result codes shared by the core and every port.
 *
 * The core never depends on ESP-IDF, so it cannot use esp_err_t. Adapters
 * translate their native error codes into gd_status_t at the port boundary.
 */
#pragma once

/** Outcome of a port operation or use case step. */
typedef enum {
    GD_OK = 0,           /**< Operation succeeded. */
    GD_ERR_NOT_FOUND,    /**< Peripheral absent or did not identify itself. */
    GD_ERR_TIMEOUT,      /**< Peripheral did not answer in time. */
    GD_ERR_REJECTED,     /**< Peripheral answered with an explicit error. */
    GD_ERR_IO,           /**< Bus or transport failure. */
    GD_ERR_STATE,        /**< Operation not valid in the current state. */
} gd_status_t;

/**
 * @brief Human-readable name of a status, for reports.
 * @param status Any gd_status_t value.
 * @return Static string, never NULL.
 */
const char *gd_status_name(gd_status_t status);
