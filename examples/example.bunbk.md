# Hello Bunbook!

We can define a variable:

```buneval
const x = 10;
console.log(`Initial x is: ${x}`);
```

And then re-declare it (this would fail in standard JS if we used `const` but we transpile to `var`):

```buneval
const x = 20;
console.log(`Re-declared x is: ${x}`);
```

And perform a complex operation:

```buneval
const sum = (a, b) => a + b;
console.log(`Sum of 25+17: ${sum(25, 17)}`);
```

Wait, can we use top-level await?

```buneval
const response = await fetch("https://example.com");
console.log(`Status: ${response.status}`);
```
