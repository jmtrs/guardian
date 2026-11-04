/**
 * @file platform_port.h
 * @brief Driven port: MCU services (time, identity, battery, sleep).
 */
#pragma once

#include <stdint.h>

/** Why the MCU is running. */
typedef enum {
    GD_WAKE_POWER_ON,  /**< Cold boot or reset. */
    GD_WAKE_MOTION,    /**< Woken from deep sleep by the motion interrupt. */
    GD_WAKE_OTHER,     /**< Any other wake source. */
} gd_wake_cause_t;

/** Static identity of the board, for bring-up records. */
typedef struct {
    uint16_t chip_revision; /**< Chip revision, major*100 + minor. */
    uint8_t cores;          /**< CPU cores. */
    uint32_t flash_bytes;   /**< Detected flash size. */
    uint32_t psram_bytes;   /**< Usable PSRAM, 0 if absent. */
    uint8_t mac[6];         /**< Base MAC address. */
} gd_platform_identity_t;

/** Platform operations required by the core. */
typedef struct {
    void *ctx; /**< Adapter state, opaque to the core. */

    /** Block the calling task. */
    void (*delay_ms)(void *ctx, uint32_t ms);

    /** Fill @p identity with chip, memory and MAC data. */
    void (*identity)(void *ctx, gd_platform_identity_t *identity);

    /** Battery rail in mV, or -1 if it cannot be measured. */
    int32_t (*battery_mv)(void *ctx);

    /** Reason for the current boot. */
    gd_wake_cause_t (*wake_cause)(void *ctx);

    /** Enter deep sleep with the motion line as wake source. Does not return. */
    void (*deep_sleep_until_motion)(void *ctx);
} gd_platform_port_t;
