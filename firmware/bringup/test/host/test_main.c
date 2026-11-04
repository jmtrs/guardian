/**
 * @file test_main.c
 * @brief Host test runner for the bring-up core.
 */
#include "test.h"

int gd_test_failures = 0;
int gd_test_checks = 0;

void test_domain(void);
void test_bringup(void);

int main(void)
{
    test_domain();
    test_bringup();
    printf("\n%d checks, %d failures\n", gd_test_checks, gd_test_failures);
    return gd_test_failures == 0 ? 0 : 1;
}
