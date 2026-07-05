FROM public.ecr.aws/lambda/python:3.11

COPY requirements-lambda.txt ${LAMBDA_TASK_ROOT}/
RUN pip install \
    -r ${LAMBDA_TASK_ROOT}/requirements-lambda.txt \
    "pillow==11.0.0" \
    --target ${LAMBDA_TASK_ROOT} \
    --no-cache-dir

COPY lambda_function.py auth.py db.py ${LAMBDA_TASK_ROOT}/
COPY fonts/ ${LAMBDA_TASK_ROOT}/fonts/

CMD ["lambda_function.handler"]
