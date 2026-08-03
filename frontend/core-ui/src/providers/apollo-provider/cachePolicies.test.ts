import { gql, InMemoryCache } from '@apollo/client';
import { apolloTypePolicies } from './cachePolicies';

const fullUserQuery = gql`
  query FullUser {
    userDetail(_id: "user-1") {
      __typename
      _id
      details {
        __typename
        fullName
        avatar
        birthDate
      }
    }
  }
`;

const partialUserQuery = gql`
  query PartialUser {
    currentUser {
      __typename
      _id
      details {
        __typename
        fullName
        avatar
      }
    }
  }
`;

describe('apolloTypePolicies', () => {
  it('preserves details omitted by a later partial User response', () => {
    const cache = new InMemoryCache({ typePolicies: apolloTypePolicies });

    cache.writeQuery({
      query: fullUserQuery,
      data: {
        userDetail: {
          __typename: 'User',
          _id: 'user-1',
          details: {
            __typename: 'UserDetailsType',
            fullName: 'Shivam Gupta',
            avatar: null,
            birthDate: '1990-01-01',
          },
        },
      },
    });

    cache.writeQuery({
      query: partialUserQuery,
      data: {
        currentUser: {
          __typename: 'User',
          _id: 'user-1',
          details: {
            __typename: 'UserDetailsType',
            fullName: 'Shivam Gupta',
            avatar: null,
          },
        },
      },
    });

    expect(cache.readQuery({ query: fullUserQuery })).toEqual({
      userDetail: {
        __typename: 'User',
        _id: 'user-1',
        details: {
          __typename: 'UserDetailsType',
          fullName: 'Shivam Gupta',
          avatar: null,
          birthDate: '1990-01-01',
        },
      },
    });
  });
});
