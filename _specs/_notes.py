

    query_suggestion: {
        render: (payload, callbacks) => (
            <QuerySuggestionCard
                proposal={payload}
                onAccept={(data) => {
                    handleQueryAccept(data);
                    callbacks.onAccept?.(payload);
                }}
                onReject={callbacks.onReject}
            />
        ),
        renderOptions: {
            panelWidth: '550px',
            headerTitle: 'PubMed Query Suggestion',
            headerIcon: '🔍'
        }
    }


    handler = query_suggestion

    handler.render(activePayload.data, {
        onAccept: (data) => {
            if (handler.onAccept) {
                handler.onAccept(data);
            }
            handleClosePayload();
        },
        onReject: () => {
            if (handler.onReject) {
                handler.onReject(activePayload.data);
            }
            handleClosePayload();
        }
    })

