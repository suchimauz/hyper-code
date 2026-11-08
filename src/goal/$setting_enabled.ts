/** The new goal store is opt-in; enabling does not wire lifecycle or import legacy state. */
export default { type: "boolean", default: false, description: "Enable isolated goal storage APIs; lifecycle integration must be installed separately." };
