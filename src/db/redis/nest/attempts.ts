class Attempts {
  // set
  private readonly _set = new Set<string>();
  // add
  add(id: string) {
    this._set.add(id);
  }
  // remove
  remove(id: string) {
    this._set.delete(id);
  }
  // has
  has(id: string) {
    return this._set.has(id);
  }
  display() {
    return Array.from(this._set);
  }
}

export const attempts = new Attempts();
