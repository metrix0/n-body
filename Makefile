CC = gcc
CFLAGS = -O3 -std=c11 -Wall -Wextra -ffp-contract=off
LDLIBS = -lm

.PHONY: all test benchmark clean site
all: build/original build/sequential build/parallel

build:
	mkdir -p build

build/original: reference/nbody.c | build
	$(CC) $(CFLAGS) $< -o $@ $(LDLIBS)

build/sequential: src/sequential.c src/runtime.h reference/nbody.c | build
	$(CC) $(CFLAGS) $< -o $@ $(LDLIBS)

build/parallel: src/parallel.c src/runtime.h src/body.h | build
	$(CC) $(CFLAGS) -fopenmp $< -o $@ $(LDLIBS)

test: all
	python3 scripts/test.py

benchmark: all
	python3 scripts/benchmark.py

site:
	node scripts/build.mjs

clean:
	rm -rf build
