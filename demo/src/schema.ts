import {
  inputObjectType,
  list,
  mutationField,
  nonNull,
  objectType,
  queryField,
} from "nexus";
import { lowercase, trim } from "nexus-args-validator/dist/transformers";
import { nonEmpty, rangeSize } from "nexus-args-validator/dist//validators";

export interface IUser {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  profile?: IProfile;
}

export interface IProfile {
  bio?: string;
  teamsIds: string[];
  details: IProfileDetails;
}

export interface IProfileDetails {
  age: number;
  weight: number;
}

const users: IUser[] = [];

export const ProfileDetails = objectType({
  name: "ProfileDetails",
  sourceType: {
    module: __filename,
    export: "IProfileDetails",
  },
  definition(t) {
    t.nonNull.int("age");
    t.nonNull.int("weight");
  },
});

export const Profile = objectType({
  name: "Profile",
  sourceType: {
    module: __filename,
    export: "IProfile",
  },
  definition(t) {
    t.string("bio");
    t.nonNull.list.nonNull.field("teamsIds", { type: "ID" });
    t.nonNull.field("details", { type: "ProfileDetails" });
  },
});

export const User = objectType({
  name: "User",
  sourceType: {
    module: __filename,
    export: "IUser",
  },
  definition(t) {
    t.nonNull.string("firstName");
    t.nonNull.string("lastName");
    t.nonNull.string("username");
    t.nonNull.string("email");
    t.field("profile", {
      type: "Profile",
    });
  },
});

export const ProfileDetailsCreateInput = inputObjectType({
  name: "ProfileDetailsCreateInput",
  definition(t) {
    t.nonNull.int("age");
    t.nonNull.int("weight");
  },
});

export const ProfileCreateInput = inputObjectType({
  name: "ProfileCreateInput",
  definition(t) {
    t.string("bio");
    t.nonNull.list.nonNull.field("teamsIds", { type: "ID" });
    t.nonNull.field("details", { type: "ProfileDetailsCreateInput" });
  },
});

export const UserCreateInput = inputObjectType({
  name: "UserCreateInput",
  definition(t) {
    t.nonNull.string("firstName");
    t.nonNull.string("lastName");
    t.nonNull.string("username");
    t.nonNull.string("email");
    t.field("profile", {
      type: "ProfileCreateInput",
    });
  },
});

export const UsersQuery = queryField("users", {
  type: list("User"),
  resolve() {
    return users;
  },
});

export const CreateUserMutation = mutationField("createUser", {
  type: "User",
  args: {
    userCreateInput: nonNull("UserCreateInput"),
  },

  transform: () => ({
    userCreateInput: {
      firstName: trim,
      lastName: trim,
      username: [
        lowercase,

        (arg) => {
          // Correct short usernames
          if (arg.length < 5) {
            return arg + "12345";
          }
          return arg;
        },
      ],
    },
  }),

  validate: () => ({
    userCreateInput: {
      firstName: rangeSize(8, 12),
      lastName: nonEmpty(),
      email: rangeSize(5, 20),
      username: [
        (arg) => {
          // Username can not be "unknown"
          if (arg === "unknown") {
            return ["not-allowed", null];
          }
        },

        (arg) => {
          // Unique username
          if (users.find((u) => u.username === arg)) {
            return ["not-unique", null];
          }
        },
      ],
      profile: {
        bio: rangeSize(10, 100),
      },
    },
  }),

  resolve(_, { userCreateInput: { profile, ...rest } }) {
    const user: IUser = {
      ...rest,
      profile:
        profile === null || profile === undefined
          ? undefined
          : {
              details: profile.details,
              teamsIds: profile.teamsIds,
              bio: profile.bio === null ? undefined : profile.bio,
            },
    };
    users.push(user);
    return user;
  },
});
