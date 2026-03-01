# Advanced Bunbook Test

## Block 1: Shared State
We define a shared state object here.
```buneval
const state = { count: 0, users: [] };
function increment() {
  state.count++;
  return state.count;
}
console.log(`Initial count: ${state.count}`);
```

## Block 2: Re-declaration & Side Effects
We re-declare `const` (transpiled to `var`) and use the function from the previous block.
```buneval
const name = "Alice";
state.users.push(name);
increment(); 
console.log(`Count is now: ${state.count}`);
console.log(`Users: ${JSON.stringify(state.users)}`);
```

## Block 3: More Re-declarations
Even if we "shadow" or re-declare `name`, it should work fine.
```buneval
const name = "Bob"; // This would normally crash!
state.users.push(name);
increment();
console.log(`Final Users: ${state.users.join(", ")}`);
console.log(`Final Count: ${state.count}`);
```

## Block 4: Async with Bun specific APIs
Using `Bun.password` to show we have access to the full Bun runtime.
```buneval
const password = "my-secret-password";
const hash = await Bun.password.hash(password);
const isMatch = await Bun.password.verify(password, hash);
console.log(`Password Hash: ${hash.substring(0, 20)}...`);
console.log(`Matches? ${isMatch}`);
```
