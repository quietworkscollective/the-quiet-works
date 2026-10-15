/** The inscription faces the sill until the reveal turns it toward the visitor. */
export const nameplateRotation = (reveal: number): [number, number, number] => [-Math.PI / 2 * (1 - reveal), Math.PI, 0];
