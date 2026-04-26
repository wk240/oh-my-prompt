#!/usr/bin/env python3
"""Fix escaping issues in sports-action.json"""

import re

with open('translations/sports-action.json', 'r') as f:
    content = f.read()

# Find and fix the problematic pattern
# Looking for: Direct Sunlight (Hard Light) followed by 4 backslashes and a quote
pattern = r'Direct Sunlight \(Hard Light\)\\\\"'
fixed = re.sub(pattern, 'Direct Sunlight (Hard Light)\\"', content)

with open('translations/sports-action.json', 'w') as f:
    f.write(fixed)

print('Fixed sports-action.json')