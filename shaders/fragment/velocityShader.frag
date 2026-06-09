#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;     // this
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform isampler2D wallTex;

uniform float dragMultiplier;

uniform float wind;
uniform float windMaxAlt; // 0.0-1.0 normalized height limit for wind injection

// Action center wind injection (up to 8 centers)
uniform int   acWindCount;
uniform vec4  acWindData[8];   // x=centerX, y=altY, z=intensity*ramp, w=radiusY
uniform float acWindMoveX[8];  // signed wind speed (E+/W-), 0 = stationary
uniform float acWindRadX[8];   // horizontal radius (ellipse, sim-space units)

uniform vec2 texelSize;
// uniform vec2 resolution;

uniform vec4 initial_Tv[126];

float getInitialT(int y) { return initial_Tv[y / 4][y % 4]; }

layout(location = 0) out vec4 base;
layout(location = 2) out ivec4 wall;

float dryLapse; // NOT USED needs to be declared for common.glsl
vec2 resolution;
#include "common.glsl"

void main()
{
  base = texture(baseTex, texCoord);
  vec4 baseXpY0 = texture(baseTex, texCoordXpY0);
  vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);

  wall = texture(wallTex, texCoord);
  ivec4 wallX0Yp = texture(wallTex, texCoordX0Yp);
  ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);


  // set boundaries: no flow in or out of wall cells
  if (wall[DISTANCE] == 0) // is wall
  {
    base[VX] = 0.0;        // velocities in wall are 0
    base[VY] = 0.0;        // this will make a wall not let any pressure trough and
                           // thereby reflect any pressure waves back
  } else {

    if (wallXpY0[DISTANCE] == 0) {
      base[VX] = 0.0;                                  // Since X velocity is defined at the right of the cell, it has to be done in the cell to the left of the wall
    } else {
      base[VX] += base[PRESSURE] - baseXpY0[PRESSURE]; // The velocity through the cell changes proportionally to the pressure gradient across the cell. It's basically just newtons 2nd law.
      base[VX] *= 1. - dragMultiplier * 0.0002;        // linear drag
    }

    base[VY] += base[PRESSURE] - baseX0Yp[PRESSURE];
    base[VY] *= 1. - dragMultiplier * 0.0002;
    // quadratic drag
    // base[VX] -= base[VX] * base[VX] * base[VX] * base[VX] * base[VX] *
    // dragMultiplier; base[VY] -= base[VY] * base[VY] * base[VY] * base[VY] *
    // base[VY] * dragMultiplier;

    // Apply wind only below windMaxAlt (basses couches)
    float altFactor = windMaxAlt > 0.0 ? smoothstep(windMaxAlt, windMaxAlt * 0.5, texCoord.y) : 1.0;
    base[VX] += wind * 0.000001 * altFactor;

    // Action center wind: blend toward target speed proportional to intensity
    for (int ai = 0; ai < acWindCount; ai++) {
      float radY  = acWindData[ai].w;
      float radX  = max(acWindRadX[ai], 0.0001);
      float dx    = absHorizontalDist(acWindData[ai].x, texCoord.x) / radX;
      float dy    = (texCoord.y - acWindData[ai].y) / max(radY, 0.0001);
      float eDist = sqrt(dx * dx + dy * dy);
      float w     = smoothstep(1.0, 0.0, eDist);
      if (texCoord.y > acWindData[ai].y + radY) w = 0.0;
      if (w > 0.001) {
        // targetVX scales linearly with intensity: 0.12 = 60 km/h at max
        float targetVX = acWindMoveX[ai] * 0.12 * acWindData[ai].z;
        // blend strength: gentle (0.05/iter) so intensity controls actual speed
        float blendStr = clamp(w * 0.05, 0.0, 0.5);
        base[VX] = mix(base[VX], targetVX, blendStr);
      }
    }
  }
}