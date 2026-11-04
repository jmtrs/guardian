# Core: domain, ports and use cases. Pure C - must not REQUIRE any ESP-IDF
# component, so it also builds on the host for unit tests (test/host).
idf_component_register(
    SRCS "src/status.c" "src/accel.c" "src/report.c" "src/command.c"
         "src/bringup.c" "src/bringup_modem.c" "src/bringup_motion.c"
    INCLUDE_DIRS "include"
)

# Our code builds warning-free; keep it that way.
target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
