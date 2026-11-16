#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <omp.h>
#include "body.h"
#include "runtime.h"

int main(int argc, char **argv) {
  int steps = 10, threads = omp_get_max_threads();
  for (int a = 1; a < argc; a += 2) {
    if (a + 1 >= argc) { fprintf(stderr, "Missing option value.\n"); return 1; }
    if (!strcmp(argv[a], "--steps")) steps = number(argv[a+1], 100000);
    else if (!strcmp(argv[a], "--threads")) threads = number(argv[a+1], 1024);
    else { fprintf(stderr, "Usage: %s [--steps N] [--threads N]\n", argv[0]); return 1; }
  }
  int n, actual = 1;
  Body *p = load(&n);
  omp_set_dynamic(0);
  double start = seconds();
  #pragma omp parallel num_threads(threads) default(none) shared(p, n, steps, actual)
  {
    #pragma omp single
    actual = omp_get_num_threads();
    for (int iter = 0; iter < steps; iter++) {
      #pragma omp for schedule(static)
      for (int i = 0; i < n; i++) {
        float fx = 0.0f, fy = 0.0f, fz = 0.0f;
        for (int j = 0; j < n; j++) {
          float dx = p[j].x - p[i].x;
          float dy = p[j].y - p[i].y;
          float dz = p[j].z - p[i].z;
          float sqrd_dist = dx*dx + dy*dy + dz*dz + SOFTENING;
          float inv_dist = 1 / sqrt(sqrd_dist);
          float inv_dist3 = inv_dist * inv_dist * inv_dist;
          fx += dx * inv_dist3;
          fy += dy * inv_dist3;
          fz += dz * inv_dist3;
        }
        p[i].vx += DT * fx;
        p[i].vy += DT * fy;
        p[i].vz += DT * fz;
      }
      /* The force loop must finish before any position changes. */
      #pragma omp for schedule(static)
      for (int i = 0; i < n; i++) {
        p[i].x += p[i].vx * DT;
        p[i].y += p[i].vy * DT;
        p[i].z += p[i].vz * DT;
      }
    }
  }
  double elapsed = seconds() - start;
  save(p, n);
  fprintf(stderr, "{\"mode\":\"openmp\",\"n\":%d,\"steps\":%d,\"threads\":%d,\"seconds\":%.9f}\n", n, steps, actual, elapsed);
  free(p);
  return 0;
}
