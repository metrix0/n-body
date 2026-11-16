#define _POSIX_C_SOURCE 200809L
#define main reference_main
#include "../reference/nbody.c"
#undef main
#include "runtime.h"

int main(int argc, char **argv) {
  int steps = N_ITER;
  if (argc == 3 && strcmp(argv[1], "--steps") == 0) steps = number(argv[2], 100000);
  else if (argc != 1) { fprintf(stderr, "Usage: %s [--steps N]\n", argv[0]); return 1; }
  int n;
  Body *p = load(&n);
  double start = seconds();
  for (int k = 0; k < steps; k++) {
    body_force(p, DT, n);
    for (int i = 0; i < n; i++) {
      p[i].x += p[i].vx * DT;
      p[i].y += p[i].vy * DT;
      p[i].z += p[i].vz * DT;
    }
  }
  double elapsed = seconds() - start;
  save(p, n);
  fprintf(stderr, "{\"mode\":\"sequential\",\"n\":%d,\"steps\":%d,\"threads\":1,\"seconds\":%.9f}\n", n, steps, elapsed);
  free(p);
  return 0;
}
