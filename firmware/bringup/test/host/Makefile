# Host unit tests for components/core. The core is pure C, so it builds with
# the system compiler; no ESP-IDF needed.
#   make -C firmware/bringup/test/host        build + run
#   make -C firmware/bringup/test/host clean

CORE   := ../../components/core
CC     ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror -Wpedantic -Wshadow -Wconversion \
          -Wno-sign-conversion -g -fsanitize=address,undefined \
          -I$(CORE)/include -I.
SRCS   := $(wildcard $(CORE)/src/*.c) $(wildcard *.c)
BIN    := build/core_tests

.PHONY: test clean
test: $(BIN)
	./$(BIN)

$(BIN): $(SRCS) $(wildcard $(CORE)/include/core/*.h $(CORE)/include/core/ports/*.h *.h)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $@

clean:
	rm -rf build
