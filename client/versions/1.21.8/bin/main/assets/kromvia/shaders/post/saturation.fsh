#version 330

uniform sampler2D InSampler;

layout(std140) uniform SaturationConfig {
    float Amount;
};

in vec2 texCoord;

out vec4 fragColor;

void main() {
    vec3 color = texture(InSampler, texCoord).rgb;
    float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
    fragColor = vec4(clamp(mix(vec3(grey), color, Amount), 0.0, 1.0), 1.0);
}
