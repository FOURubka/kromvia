#version 150

uniform sampler2D InSampler;
uniform sampler2D DepthSampler;

uniform float Strength;
uniform int Samples;
uniform mat4 InvViewProj;
uniform mat4 PrevViewProj;
uniform vec3 Delta;

in vec2 texCoord;

out vec4 fragColor;

// Where this pixel was on screen last frame, from its depth and the two camera matrices.
// The blur runs along that path only, so it vanishes the moment the camera stops.
void main() {
    vec4 color = texture(InSampler, texCoord);
    float depth = texture(DepthSampler, texCoord).r;

    vec4 rel = InvViewProj * vec4(texCoord * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 prev = PrevViewProj * vec4(rel.xyz / rel.w + Delta, 1.0);
    if (prev.w <= 0.0) {
        fragColor = vec4(color.rgb, 1.0);
        return;
    }

    vec2 velocity = (texCoord - (prev.xy / prev.w * 0.5 + 0.5)) * Strength;
    float len = length(velocity);
    if (len < 0.0005) {
        fragColor = vec4(color.rgb, 1.0);
        return;
    }
    velocity *= min(len, 0.03) / len;

    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    vec3 sum = color.rgb;
    for (int i = 1; i < Samples; i++) {
        float t = (float(i) + jitter) / float(Samples) - 0.5;
        sum += texture(InSampler, clamp(texCoord + velocity * t, 0.0, 1.0)).rgb;
    }
    fragColor = vec4(sum / float(Samples), 1.0);
}
