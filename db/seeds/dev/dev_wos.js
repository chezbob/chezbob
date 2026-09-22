export async function seed(knex) {
  const wos_users = Array.from({ length: 20 }, (_, i) => {
    const number = String(i).padStart(2, "0");

    return {
        email: `bob-${number}@chezbob.com`,
        username: `bob-${number}`,
        cents: -(500 + i),  // $5.00, $5.01, etc
    };
  });

  const usernames = wos_users.map(({ username }) => username);
  const existingUsers = await knex("users")
    .select("id")
    .whereIn("username", usernames);
  const existingUserIds = existingUsers.map(({ id }) => id);
  if (existingUserIds.length > 0) {
    await knex("transactions").whereIn("user_id", existingUserIds).del();
    await knex("users").whereIn("id", existingUserIds).del();
  }

  for (const { email, username, cents } of wos_users) {
    const [userId] = await knex("users").insert({ email, username });
    await knex("transactions").insert({ user_id: userId, cents });
  }
}
