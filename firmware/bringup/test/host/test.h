/**
 * @file test.h
 * @brief Minimal assertion framework for host unit tests (no dependencies).
 */
#pragma once

#include <stdio.h>
#include <string.h>

extern int gd_test_failures; /**< Failed assertions in the whole run. */
extern int gd_test_checks;   /**< Assertions evaluated in the whole run. */

/** Assert a condition; report file:line on failure and keep running. */
#define CHECK(cond)                                                           \
    do {                                                                      \
        gd_test_checks++;                                                     \
        if (!(cond)) {                                                        \
            gd_test_failures++;                                               \
            fprintf(stderr, "  FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
        }                                                                     \
    } while (0)

/** Assert two integers are equal. */
#define CHECK_EQ(a, b) CHECK((long)(a) == (long)(b))

/** Assert two strings are equal. */
#define CHECK_STR(a, b) CHECK((a) != NULL && strcmp((a), (b)) == 0)

/** Run a test function and print its name. */
#define RUN(test)                    \
    do {                             \
        printf("- %s\n", #test);     \
        test();                      \
    } while (0)
