import * as THREE from 'three';

/**
 * Lit planet material.
 * - The original surface colour is looked up per pixel from a lat/long texture
 *   (sharp coastlines regardless of voxel size), blended in by `aSurf`.
 * - Vertex colour holds the interior layer colour (crust, mantle, core).
 * - `aGlow` drives emissive light for molten layers and heat.
 * - `aScorch` darkens burnt ground.
 */
export function createPlanetMaterial(surfaceMap: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.0,
  });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uSurfaceMap = { value: surfaceMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aGlow; attribute float aSurf; attribute float aScorch;
        varying float vGlow; varying float vSurf; varying float vScorch; varying vec3 vLocal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = aGlow; vSurf = aSurf; vScorch = aScorch; vLocal = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uSurfaceMap;
        varying float vGlow; varying float vSurf; varying float vScorch; varying vec3 vLocal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 d = normalize(vLocal);
          vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
          vec3 surf = texture2D(uSurfaceMap, uv).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, surf, clamp(vSurf, 0.0, 1.0));
          float sc = clamp(vScorch, 0.0, 1.0);
          diffuseColor.rgb = diffuseColor.rgb * (1.0 - min(0.85, sc * 1.1)) + vec3(0.04, 0.02, 0.0) * sc;
          if (vGlow < -0.05) {
            float cold = clamp(-vGlow, 0.0, 2.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.94, 1.0), clamp(cold * 0.75, 0.0, 0.88));
          }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float g = clamp(vGlow, 0.0, 2.0);
          vec3 hot = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.62, 0.18), clamp(g, 0.0, 1.0));
          hot = mix(hot, vec3(1.0, 0.95, 0.75), clamp(g - 1.0, 0.0, 1.0));
          totalEmissiveRadiance += hot * g * 0.85;
          if (vGlow < -0.05) {
            float cold = clamp(-vGlow, 0.0, 2.0);
            vec3 frost = mix(vec3(0.2, 0.75, 1.0), vec3(0.7, 0.95, 1.0), clamp(cold * 0.5, 0.0, 1.0));
            totalEmissiveRadiance += frost * cold * 0.55;
          }
        }`);
  };
  return mat;
}
