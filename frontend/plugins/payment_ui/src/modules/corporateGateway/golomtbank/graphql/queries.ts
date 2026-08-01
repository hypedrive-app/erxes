const listQuery = `
query GolomtBankConfigsList($page: Int, $perPage: Int) {
    golomtBankConfigsList(page: $page, perPage: $perPage) {
      list {
        _id
        name
        organizationName
        clientId
        ivKey
        sessionKey
        registerId
        configPassword
        accountId
        golomtCode
        apiUrl
      }
      totalCount
    }
  }
`;

const accountDetailQuery = `
query GolomtBankAccountDetail($configId: String!, $accountId: String!) {
    golomtBankAccountDetail(configId: $configId, accountId: $accountId) {
      requestId
      accountNumber
      currency
      customerName
      titlePrefix
      accountName
      accountShortName
      freezeStatusCode
      freezeReasonCode
      openDate
      status
      productName
      type
      intRate
      isRelParty
      branchId
    }
  }
`;

const accountBalanceQuery = `
query GolomtBankAccountBalance($configId: String!, $accountId: String!) {
    golomtBankAccountBalance(configId: $configId, accountId: $accountId) {
      requestId
      accountId
      accountName
      currency
      balanceLL
    }
  }
`;

const statementsQuery = `
query GolomtBankStatements($configId: String!, $accountId: String!, $page: Int, $perPage: Int, $startDate: String, $endDate: String) {
    golomtBankStatements(configId: $configId, accountId: $accountId, page: $page, perPage: $perPage, startDate: $startDate, endDate: $endDate) {
      requestId
      accountId
      statements {
        requestId
        tranDesc
        tranPostedDate
        tranAmount
        balance
      }
    }
  }
`;

export default {
  listQuery,
  accountDetailQuery,
  accountBalanceQuery,
  statementsQuery,
};
