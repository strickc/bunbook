# Console Table Demo

Bunbook can render `console.table` as a pretty HTML table automatically.

## Sample Data
```buneval
const users = [
  { id: 1, name: "Alice", role: "Admin", active: true },
  { id: 2, name: "Bob", role: "User", active: false },
  { id: 3, name: "Charlie", role: "Admin", active: true },
  { id: 4, name: "Diana", role: "User", active: true },
];

console.table(users);
```

## Filtering Data
You can also filter what's shown:
```buneval
const admins = users.filter(u => u.role === "Admin");
console.table(admins);
```
