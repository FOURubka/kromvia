#version 330

uniform sampler2D InSampler;

layout(std140) uniform BrightnessConfig {
    float Amount;
};

in vec2 texCoord;

out vec4 fragColor;

void main() {
    vec3 color = texture(InSampler, texCoord).rgb;
    fragColor = vec4(clamp(color * Amount, 0.0, 1.0), 1.0);
}
