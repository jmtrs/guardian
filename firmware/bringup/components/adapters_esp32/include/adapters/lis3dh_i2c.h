/**
 * @file lis3dh_i2c.h
 * @brief Driven adapter: ST LIS3DH over I2C, implements gd_motion_sensor_port_t.
 */
#pragma once

#include "core/ports/motion_sensor_port.h"
#include "driver/gpio.h"
#include "driver/i2c_types.h"

/** Wiring of the accelerometer. */
typedef struct {
    i2c_port_num_t i2c_port; /**< I2C controller to use. */
    gpio_num_t sda;       /**< I2C data. */
    gpio_num_t scl;       /**< I2C clock. */
    gpio_num_t interrupt; /**< INT1 line, read as input. */
} lis3dh_config_t;

/**
 * @brief Configure the bus and interrupt pin and expose the port.
 *
 * The sensor itself is only touched on probe(), so construction never fails
 * because of a missing breakout. Single instance.
 */
const gd_motion_sensor_port_t *lis3dh_i2c_create(const lis3dh_config_t *config);
