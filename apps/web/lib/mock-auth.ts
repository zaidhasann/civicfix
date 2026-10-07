export interface AuthCredentials {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResult {
  user: {
    email: string;
    name: string;
  };
}

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

export async function mockLogin(credentials: AuthCredentials): Promise<AuthResult> {
  await wait(700);

  if (
    credentials.email.toLowerCase() === 'demo@civicfix.test' &&
    credentials.password !== 'Password123!'
  ) {
    throw new Error('That password is not correct. Try Password123! for the demo account.');
  }

  return {
    user: { email: credentials.email, name: 'CivicFix citizen' },
  };
}

export async function mockSignup(credentials: AuthCredentials): Promise<AuthResult> {
  await wait(900);

  if (credentials.email.toLowerCase() === 'taken@civicfix.test') {
    throw new Error('An account already exists with this email.');
  }

  return {
    user: { email: credentials.email, name: credentials.name ?? 'CivicFix citizen' },
  };
}
