#ifndef BODY_H
#define BODY_H
typedef struct { float x, y, z, vx, vy, vz; } Body;
#define DT 0.01f
#define SOFTENING 1e-9f
#endif
