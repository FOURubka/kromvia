#version 330

uniform sampler2D InSampler;

layout(std140) uniform HueConfig {
    float Amount;
};

in vec2 texCoord;

out vec4 fragColor;

void main() {
    vec3 color = texture(InSampler, texCoord).rgb;
    const mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 toRgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toYiq * color;
    float a = radians(Amount);
    yiq.yz = mat2(cos(a), sin(a), -sin(a), cos(a)) * yiq.yz;
    fragColor = vec4(clamp(toRgb * yiq, 0.0, 1.0), 1.0);
}
