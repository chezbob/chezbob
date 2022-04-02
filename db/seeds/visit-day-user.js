export async function seed(knex) {
  try {
    await knex("users").insert({
      username: "visitday",
      email: "chezbob+visitday@cs.ucsd.edu",
    });
  } catch (e) {
    console.log("visitday user already exists");
  }
}
