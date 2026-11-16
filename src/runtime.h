#ifndef RUNTIME_H
#define RUNTIME_H
#include <errno.h>
#include <limits.h>
#include <stdint.h>
#include <time.h>

static int number(const char *s, int maximum) {
  char *end;
  errno = 0;
  long n = strtol(s, &end, 10);
  if (errno || *s == '\0' || *end || n < 1 || n > maximum) {
    fprintf(stderr, "Invalid positive integer: %s\n", s);
    exit(EXIT_FAILURE);
  }
  return (int)n;
}
static double seconds(void) {
  struct timespec t;
  if (clock_gettime(CLOCK_MONOTONIC, &t)) { perror("clock_gettime"); exit(EXIT_FAILURE); }
  return (double)t.tv_sec + (double)t.tv_nsec / 1e9;
}
static Body *load(int *n) {
  _Static_assert(sizeof(int) == 4 && sizeof(Body) == 24, "Dataset needs 32-bit int and six floats");
  if (fread(n, sizeof(*n), 1, stdin) != 1 || *n < 1 || *n > 1000000) {
    fprintf(stderr, "Invalid body count (expected 1..1000000).\n"); exit(EXIT_FAILURE);
  }
  Body *p = malloc((size_t)*n * sizeof(*p));
  if (!p) { perror("malloc"); exit(EXIT_FAILURE); }
  if (fread(p, sizeof(*p), (size_t)*n, stdin) != (size_t)*n || fgetc(stdin) != EOF) {
    fprintf(stderr, "Truncated dataset or trailing bytes.\n"); free(p); exit(EXIT_FAILURE);
  }
  for (int i = 0; i < *n; i++) {
    if (!isfinite(p[i].x) || !isfinite(p[i].y) || !isfinite(p[i].z) ||
        !isfinite(p[i].vx) || !isfinite(p[i].vy) || !isfinite(p[i].vz)) {
      fprintf(stderr, "Non-finite input.\n"); free(p); exit(EXIT_FAILURE);
    }
  }
  return p;
}
static void save(Body *p, int n) {
  if (fwrite(p, sizeof(*p), (size_t)n, stdout) != (size_t)n || fflush(stdout)) {
    perror("write"); free(p); exit(EXIT_FAILURE);
  }
}
#endif
