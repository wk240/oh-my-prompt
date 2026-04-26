import json

# Read the file
with open('translations/character-design.json', 'r') as f:
    content = f.read()

# The issue: "rule_3": "...upon contact.\"" should be "rule_3": "...upon contact."
# In the outer JSON string, \" appears as \\"
# So we need to replace: upon contact.\\" with upon contact."

# Find and fix the problematic pattern
# The inner JSON has: \"rule_3\": \"...upon contact.\"
# In outer JSON this appears as: \\\"rule_3\\\": \\\"...upon contact.\\\" (with double escaping)

# Let me find the exact pattern
fixed = content.replace('upon contact.\\"', 'upon contact.')

with open('translations/character-design.json', 'w') as f:
    f.write(fixed)

print('Fixed')

# Verify
try:
    with open('translations/character-design.json', 'r') as f:
        data = json.load(f)
    print('JSON is valid now')
except json.JSONDecodeError as e:
    print(f'Still invalid: {e}')