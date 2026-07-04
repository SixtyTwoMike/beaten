import "react";

// Safari/iOS honor the non-standard `passwordrules` attribute on password
// inputs to guide its auto-generated strong passwords. It isn't in React's
// built-in DOM typings, so declare it here.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface InputHTMLAttributes<T> {
    passwordrules?: string;
  }
}
