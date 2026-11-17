#version 150

uniform sampler2D InSampler;

uniform float Amount;

in vec2 texCoord;

out vec4 fragColor;

void main() {
    vec3 c = texture(InSampler, texCoord).rgb;
    vec3 lms = vec3(17.8824 * c.r + 43.5161 * c.g + 4.11935 * c.b,
                    3.45565 * c.r + 27.1554 * c.g + 3.86714 * c.b,
                    0.0299566 * c.r + 0.184309 * c.g + 1.46709 * c.b);
    int type = int(Amount + 0.5);
    if (type == 1) lms.x = 2.02344 * lms.y - 2.52581 * lms.z;
    else if (type == 2) lms.y = 0.494207 * lms.x + 1.24827 * lms.z;
    else lms.z = -0.395913 * lms.x + 0.801109 * lms.y;
    vec3 sim = vec3(0.0809444479 * lms.x - 0.130504409 * lms.y + 0.116721066 * lms.z,
                    -0.0102485335 * lms.x + 0.0540193266 * lms.y - 0.113614708 * lms.z,
                    -0.000365296938 * lms.x - 0.00412161469 * lms.y + 0.693511405 * lms.z);
    vec3 err = c - sim;
    vec3 shift = vec3(0.0, 0.7 * err.r + err.g, 0.7 * err.r + err.b);
    fragColor = vec4(clamp(c + shift, 0.0, 1.0), 1.0);
}
