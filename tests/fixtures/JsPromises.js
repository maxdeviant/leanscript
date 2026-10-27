// The JS implementations of the externs in `JsPromises.lean`.

export const delay = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

export const failAfter = (ms, msg) =>
  new Promise((_resolve, reject) => setTimeout(() => reject(new Error(msg.toString())), ms));
