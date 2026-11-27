#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(std140) uniform SaturationConfig {
    float Amount;
};

layout(location = 0) in vec2 texCoord;

layout(location = 0) out vec4 fragColor;

void main() {
    vec3 color = texture(InSampler, texCoord).rgb;
    float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
    fragColor = vec4(clamp(mix(vec3(grey), color, Amount), 0.0, 1.0), 1.0);
}
