# Composition root: wires adapters into the core. No logic here.
idf_component_register(
    SRCS "main.c"
    REQUIRES core adapters_esp32
)

# Our code builds warning-free; keep it that way.
target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
