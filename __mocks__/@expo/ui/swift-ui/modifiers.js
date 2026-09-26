// Each modifier stands in as a plain description of itself, for a test to check.
const modifier = (name) => (...args) => ({ $type: name, args });

module.exports = {
  buttonStyle: modifier("buttonStyle"),
  buttonBorderShape: modifier("buttonBorderShape"),
  controlSize: modifier("controlSize"),
  labelStyle: modifier("labelStyle"),
};
