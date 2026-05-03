import re
with open('backend/src/main.cpp', 'r') as f:
    content = f.read()

funcs = re.findall(r'(void|int|json|std::optional[a-zA-Z<>:]*|httplib::Server.*)[\s\n]+([a-zA-Z0-9_]+)\([^)]*\)[\s\n]*\{.*?(sqlite3_.*?)\}', content, re.DOTALL)
for f in funcs:
    print(f[1])
